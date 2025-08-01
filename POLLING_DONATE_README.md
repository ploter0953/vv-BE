# Donate System - Polling Architecture

Hệ thống donate đã được cập nhật để sử dụng polling thay vì WebSocket, phù hợp với Vercel hosting.

## Cấu trúc Database

### Collection: `donations`
```javascript
{
  id: "user_id", // ID người nhận donate
  donate: [
    {
      name: "donor_name",
      amount: 10000,
      message: "donation_message",
      timestamp: Date
    }
  ],
  createdAt: Date // Tự động xóa sau 15 giây
}
```

## Backend Architecture

### 1. Donation Cleanup Service
- **File**: `services/donationCleanupService.js`
- **Chức năng**: Tự động xóa donations sau 15 giây
- **Interval**: Chạy mỗi 5 giây
- **Logic**: Xóa records có `createdAt` < 15 giây trước

### 2. Updated Donate Routes
- **File**: `routes/donateRoutes.js`
- **Endpoints**:
  - `GET /api/donate/latest` - Lấy donation mới nhất
  - `GET /api/donate/recent` - Lấy tất cả donations trong 15 giây qua
  - `GET /api/donate/user/:userId` - Thông tin donate của user
  - `GET /api/donate/leaderboard` - Bảng xếp hạng

### 3. Updated MongoDB Functions
- **File**: `donate/mongo.js`
- **Functions**:
  - `saveDonation()` - Lưu với cấu trúc mới
  - `getUserDonations()` - Lấy từ mảng donate
  - `getUserTotalDonated()` - Tính tổng từ mảng donate

## Frontend Architecture

### 1. Polling Implementation
- **DonationAlert**: Poll mỗi 5 giây
- **UserDonation**: Poll mỗi 5 giây để cập nhật
- **No WebSocket**: Sử dụng fetch API

### 2. Updated API Service
- **File**: `services/donateAPI.js`
- **Methods**:
  - `getLatestDonation()` - Lấy donation mới nhất
  - `getRecentDonations()` - Lấy tất cả donations gần đây
  - `getUserDonationData()` - Thông tin user donate

## Workflow

### 1. Donation Process
1. User thực hiện donate qua Discord hoặc Casso
2. Backend lưu vào collection `donations` với cấu trúc mới
3. Cleanup service tự động xóa sau 15 giây
4. Frontend poll mỗi 5 giây để cập nhật

### 2. Real-time Updates
1. Frontend gọi `/api/donate/latest` mỗi 5 giây
2. Nếu có donation mới, hiển thị alert
3. User pages cũng poll để cập nhật thống kê

### 3. Data Structure
```javascript
// Backend lưu
{
  id: "user123",
  donate: [
    {
      name: "Donor A",
      amount: 50000,
      message: "Support!",
      timestamp: "2024-01-01T10:00:00Z"
    }
  ],
  createdAt: "2024-01-01T10:00:00Z"
}

// Frontend nhận
{
  donation: {
    name: "Donor A",
    amount: 50000,
    message: "Support!",
    timestamp: "2024-01-01T10:00:00Z"
  }
}
```

## Advantages

### 1. Vercel Compatibility
- Không cần WebSocket support
- Stateless architecture
- Serverless friendly

### 2. Simplicity
- Dễ debug và maintain
- Standard HTTP requests
- No connection management

### 3. Scalability
- Polling có thể scale
- Database cleanup tự động
- Memory efficient

## Configuration

### Environment Variables
```env
MONGO_URI=your_mongodb_uri
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
CASSO_TOKEN=your_casso_token
```

### Polling Intervals
- **Backend Cleanup**: 5 giây
- **Frontend Polling**: 5 giây
- **Donation TTL**: 15 giây

## Monitoring

### Backend Logs
- Cleanup service logs
- Donation save logs
- Error handling

### Frontend Logs
- Polling success/failure
- Donation alerts
- User interaction

## Deployment

### Backend (Render)
1. Deploy với environment variables
2. Cleanup service tự động start
3. Monitor logs cho errors

### Frontend (Vercel)
1. Build và deploy
2. Configure API URL
3. Test polling functionality

## Testing

### Manual Testing
1. Thực hiện donate qua Discord
2. Kiểm tra alert hiển thị
3. Verify cleanup sau 15 giây
4. Test user donation pages

### Automated Testing
- API endpoint tests
- Database cleanup tests
- Frontend polling tests
- Error handling tests