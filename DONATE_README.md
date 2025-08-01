# Donate System Integration

Hệ thống donate đã được tích hợp vào backend chính của projectvtuber.com.

## Cấu trúc Database

Sử dụng database `vtuberverse` với các collection:

### Collections
- `donate_users`: Lưu thông tin user donate (balance, donated amount)
- `donations`: Lưu lịch sử donations

### Schema

**donate_users:**
```javascript
{
  _id: "discord_id",
  balance: 0,
  donated: 0
}
```

**donations:**
```javascript
{
  _id: "timestamp_id",
  userId: "user_id",
  name: "donor_name",
  amount: 10000,
  message: "donation_message",
  source: "discord|casso",
  timestamp: Date
}
```

## API Endpoints

### Donate Routes (`/api/donate`)
- `GET /api/donate/socket` - Socket.IO endpoint
- `GET /api/donate/latest` - Lấy donation mới nhất
- `GET /api/donate/balance/:discordId` - Lấy balance của user
- `GET /api/donate/leaderboard` - Bảng xếp hạng donate
- `GET /api/donate/user/:userId` - Thông tin donate của user
- `GET /api/donate/user/:userId/history` - Lịch sử donate của user

### Casso Webhook (`/api/casso-webhook`)
- `POST /api/casso-webhook` - Webhook nhận thông báo nạp tiền từ Casso

## Pages

### Donate Alert Page
- URL: `/donate`
- Hiển thị real-time donation alerts
- Socket.IO connection cho live updates

### User Donation Pages
- URL: `/donation/:userId`
- Trang donate riêng cho từng user
- Hiển thị thống kê và lịch sử donate

## Discord Bot Commands

### Commands Available
- `/start` - Khởi tạo tài khoản donate
- `/info` - Xem thông tin tài khoản
- `/naptien` - Hướng dẫn nạp tiền
- `/donate` - Thực hiện donate
- `/reset` - Reset donated amount (admin only)
- `/leaderboard` - Bảng xếp hạng donate

## Environment Variables

Thêm vào file `.env`:

```env
# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Casso Payment Gateway
CASSO_TOKEN=your_casso_webhook_token
```

## Deployment

### Deploy Discord Commands
```bash
npm run deploy-commands
```

### Start Server
```bash
npm start
```

## Features

### Real-time Donation Alerts
- Socket.IO integration
- Live donation notifications
- Animated alerts với sound effects

### Payment Integration
- Casso payment gateway webhook
- Automatic balance updates
- Transaction logging

### User Management
- Discord-based authentication
- Balance tracking
- Donation history
- Leaderboard system

### Multi-user Support
- Individual donation pages
- User-specific statistics
- Personalized donation tracking

## Security

- CORS protection cho donate domains
- Webhook token validation
- Admin-only commands
- Rate limiting cho donate commands

## Monitoring

- MongoDB change streams cho real-time updates
- Discord bot status monitoring
- Webhook delivery tracking
- Error logging và alerting