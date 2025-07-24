const express = require('express');
const Order = require('../models/Order');
const Commission = require('../models/Commission');
const User = require('../models/User');
const { requireAuth } = require('@clerk/express');

const router = express.Router();

// Tạo order
router.post('/', requireAuth(), async (req, res) => {
  try {
    const { commissionId } = req.body;
    const commission = await Commission.findById(commissionId);
    if (!commission) return res.status(404).json({ message: 'Commission not found' });
    
    // Check if commission is open
    if (commission.status !== 'open') {
      return res.status(400).json({ message: 'Commission is not available for ordering' });
    }
    
    // Create the order
    const order = new Order({
      commission: commissionId,
      buyer: req.auth.userId,
    });
    await order.save();
    
    // Update commission status to pending when first order is created
    commission.status = 'pending';
    await commission.save();
    
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy tất cả order
router.get('/', requireAuth(), async (req, res) => {
  console.log('=== FETCH ORDERS ===');
  console.log('User ID:', req.auth.userId);
  console.log('Query params:', req.query);

  try {
    let orders;
    if (req.query.type === 'customer') {
      console.log('Fetching customer orders...');
      orders = await Order.find({ buyer: req.auth.userId }).populate('commission');
      console.log('Found customer orders:', orders.length);
    } else if (req.query.type === 'artist') {
      console.log('Fetching artist orders...');
      console.log('Looking for commissions with user:', req.auth.userId);

      // First find the user by clerkId to get MongoDB ObjectId
      const user = await User.findOne({ clerkId: req.auth.userId });
      if (!user) {
        console.log('User not found for clerkId:', req.auth.userId);
        return res.json({ orders: [] });
      }

      console.log('Found user:', { id: user._id, clerkId: user.clerkId, username: user.username });

      const commissions = await Commission.find({ user: user._id });
      console.log('User commissions found:', commissions.length);
      console.log('Commission details:', commissions.map(c => ({
        id: c._id,
        title: c.title,
        user: c.user,
        status: c.status
      })));

      const commissionIds = commissions.map(c => c._id);
      console.log('Commission IDs to search for orders:', commissionIds);

      if (commissionIds.length > 0) {
        orders = await Order.find({ commission: { $in: commissionIds } }).populate('commission');
        console.log('Orders found for these commissions:', orders.length);
        console.log('Order details:', orders.map(o => ({
          id: o._id,
          commission_id: o.commission?._id,
          buyer: o.buyer,
          status: o.status
        })));
      } else {
        console.log('No commissions found for user, so no orders');
        orders = [];
      }
    } else {
      console.log('Fetching all orders...');
      orders = await Order.find().populate('commission');
      console.log('Found all orders:', orders.length);
    }

    // Populate buyer and artist info
    console.log('Populating user info...');
    const users = await User.find({});
    const userMap = {};
    users.forEach(u => { userMap[u.clerkId] = u; });
    console.log('User map created with', Object.keys(userMap).length, 'users');

    const ordersWithUser = orders.map(order => {
      const orderObj = order.toObject();
      // customer_id
      orderObj.customer_id = userMap[order.buyer] || null;
      
      // artist_id (user của commission) - need to handle both ObjectId and clerkId
      let artistId = null;
      if (order.commission) {
        // If commission.user is populated object, get clerkId
        if (order.commission.user && typeof order.commission.user === 'object' && order.commission.user.clerkId) {
          artistId = userMap[order.commission.user.clerkId];
        } else if (order.commission.user && typeof order.commission.user === 'string') {
          // If it's clerkId string
          artistId = userMap[order.commission.user];
        } else {
          // If it's ObjectId, find user by ObjectId
          const artistUser = users.find(u => u._id.toString() === order.commission.user.toString());
          if (artistUser) {
            artistId = artistUser;
          }
        }
      }
      orderObj.artist_id = artistId;

      console.log('Processed order:', {
        id: orderObj._id,
        status: orderObj.status,
        buyer: orderObj.buyer,
        commission_user: order.commission?.user,
        has_customer_info: !!orderObj.customer_id,
        has_artist_info: !!orderObj.artist_id
      });

      return orderObj;
    });

    console.log('=== FETCH ORDERS SUCCESS ===');
    console.log('Returning', ordersWithUser.length, 'orders');
    res.json({ orders: ordersWithUser });
  } catch (err) {
    console.error('=== FETCH ORDERS ERROR ===');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Lấy order theo id
router.get('/:id', requireAuth(), async (req, res) => {
  console.log('=== FETCH SINGLE ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);

  try {
    const order = await Order.findById(req.params.id).populate('commission').populate('buyer', 'username email');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_id: order.commission?._id
    } : 'NOT FOUND');
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log('=== FETCH SINGLE ORDER SUCCESS ===');
    res.json(order);
  } catch (err) {
    console.error('=== FETCH SINGLE ORDER ERROR ===');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật trạng thái order
router.put('/:id', requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Chỉ buyer hoặc admin mới được cập nhật
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (order.buyer.toString() !== req.auth.userId && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    order.status = req.body.status || order.status;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa order
router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Chỉ buyer hoặc admin mới được xóa
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (order.buyer.toString() !== req.auth.userId && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await order.deleteOne();
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Customer reject: từ chối xác nhận hoàn thành, chuyển order về in_progress
router.post('/:id/customer-reject', requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Chỉ buyer mới được từ chối
    if (order.buyer !== req.auth.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    order.status = 'customer_rejected';
    order.rejection_reason = req.body.reason || '';
    await order.save();
    res.json({ message: 'Order set to customer_rejected after customer rejection', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Artist reject: từ chối đơn hàng khi ở pending, confirmed, hoặc in_progress
router.post('/:id/artist-reject', requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    // Find user by clerkId to get ObjectId
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    // Chỉ artist (chủ commission) mới được từ chối
    if (!order.commission || order.commission.user.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Cho phép từ chối khi order ở pending, confirmed, in_progress, hoặc customer_rejected
    if (!['pending', 'confirmed', 'in_progress', 'customer_rejected'].includes(order.status)) {
      return res.status(400).json({ message: 'Order must be in pending, confirmed, in_progress, or customer_rejected to artist reject' });
    }
    order.status = 'artist_rejected';
    order.rejection_reason = req.body.reason || '';
    await order.save();
    
    // Check if commission should be reopened (only if no more active orders)
    const activeOrders = await Order.countDocuments({ 
      commission: order.commission._id, 
      status: { $in: ['pending', 'confirmed', 'in_progress', 'waiting_customer_confirmation', 'customer_rejected'] } 
    });
    
    let commission = null;
    if (activeOrders === 0 && order.commission && order.commission._id) {
      commission = await Commission.findById(order.commission._id);
      if (commission) {
        commission.status = 'open';
        await commission.save();
      }
    }
    
    res.json({ message: 'Order artist rejected and commission reopened', order, commission });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Artist complete order: hoàn thành đơn hàng, chuyển về waiting_customer_confirmation
router.post('/:id/complete', requireAuth(), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Chỉ artist (chủ commission) mới được hoàn thành
    if (!order.commission || order.commission.user !== req.auth.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Cho phép hoàn thành khi order ở confirmed, in_progress, hoặc customer_rejected
    if (!['confirmed', 'in_progress', 'customer_rejected'].includes(order.status)) {
      return res.status(400).json({ message: 'Order must be in confirmed, in_progress, or customer_rejected to complete' });
    }
    order.status = 'waiting_customer_confirmation';
    order.completed_at = new Date();
    await order.save();
    res.json({ message: 'Order completed, waiting for customer confirmation', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Debug endpoint to check all orders
router.get('/debug/all', requireAuth(), async (req, res) => {
  console.log('=== DEBUG ALL ORDERS ===');
  try {
    const allOrders = await Order.find().populate('commission');
    console.log('Total orders in database:', allOrders.length);
    console.log('Order details:', allOrders.map(o => ({
      id: o._id,
      commission_id: o.commission?._id,
      commission_title: o.commission?.title,
      commission_user: o.commission?.user,
      buyer: o.buyer,
      status: o.status,
      created_at: o.created_at
    })));
    
    res.json({
      totalOrders: allOrders.length,
      orders: allOrders.map(o => ({
        id: o._id,
        commission_id: o.commission?._id,
        commission_title: o.commission?.title,
        commission_user: o.commission?.user,
        buyer: o.buyer,
        status: o.status,
        created_at: o.created_at
      }))
    });
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check all commissions
router.get('/debug/commissions', requireAuth(), async (req, res) => {
  console.log('=== DEBUG ALL COMMISSIONS ===');
  try {
    const allCommissions = await Commission.find();
    console.log('Total commissions in database:', allCommissions.length);
    console.log('Commission details:', allCommissions.map(c => ({
      id: c._id,
      title: c.title,
      user: c.user,
      status: c.status,
      created_at: c.created_at
    })));
    
    res.json({
      totalCommissions: allCommissions.length,
      commissions: allCommissions.map(c => ({
        id: c._id,
        title: c.title,
        user: c.user,
        status: c.status,
        created_at: c.created_at
      }))
    });
  } catch (err) {
    console.error('Debug error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 