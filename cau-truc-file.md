# Cấu trúc File - VtuberVerse Backend

## Tổng quan
Đây là một dự án backend API cho ứng dụng VtuberVerse, được xây dựng với Node.js, Express và SQLite. Dự án quản lý hệ thống commission cho VTuber.

## Cấu trúc thư mục chính

```
/workspace/
├── .git/                    # Git repository
├── models/                  # Các model dữ liệu
├── routes/                  # Các route API
├── Procfile                 # Cấu hình deployment
├── README.md               # Tài liệu dự án
├── env.example             # Mẫu file environment
├── package.json            # Cấu hình npm và dependencies
├── package-lock.json       # Lock file cho dependencies
├── server.js               # File server chính
├── serverless.js           # Cấu hình serverless
└── test-profile-email.js   # File test
```

## Chi tiết các thư mục

### 📁 models/ (Các Model Dữ liệu)
- `Commission.js` (785B, 28 dòng) - Model cho hệ thống commission
- `Feedback.js` (439B, 12 dòng) - Model cho feedback/đánh giá
- `Order.js` (756B, 26 dòng) - Model cho đơn hàng
- `User.js` (637B, 19 dòng) - Model cho người dùng
- `Vote.js` (437B, 11 dòng) - Model cho hệ thống vote

### 📁 routes/ (Các Route API)
- `commissionRoutes.js` (11KB, 296 dòng) - API endpoints cho commission
- `orderRoutes.js` (11KB, 309 dòng) - API endpoints cho đơn hàng
- `userRoutes.js` (3KB, 105 dòng) - API endpoints cho người dùng

## Files chính

### 📄 server.js (51KB, 1613 dòng)
File server chính, chứa:
- Cấu hình Express server
- Middleware setup
- Database connection
- Route configuration

### 📄 serverless.js (7.9KB, 266 dòng)
Cấu hình cho deployment serverless (có thể là Vercel)

### 📄 package.json
Cấu hình dự án với các dependencies chính:
- **Framework**: Express.js
- **Database**: SQLite, PostgreSQL, MongoDB (mongoose)
- **Authentication**: Clerk SDK, JWT, bcryptjs
- **File Upload**: Multer, Cloudinary
- **Other**: CORS, dotenv

## Công nghệ sử dụng

- **Backend Framework**: Node.js + Express
- **Database**: SQLite (chính), PostgreSQL, MongoDB
- **Authentication**: Clerk + JWT
- **File Storage**: Cloudinary
- **Development**: Nodemon

## Scripts có sẵn

- `npm start` - Chạy production
- `npm run dev` - Chạy development với nodemon
- `npm run build` - Build project
- `npm run vercel-build` - Build cho Vercel

## Tính năng chính

Dựa trên cấu trúc file, dự án này hỗ trợ:
1. **Quản lý người dùng** - Đăng ký, đăng nhập, profile
2. **Hệ thống Commission** - Tạo, quản lý commission cho VTuber
3. **Quản lý đơn hàng** - Xử lý orders
4. **Feedback & Vote** - Đánh giá và vote
5. **File upload** - Upload hình ảnh qua Cloudinary

## Môi trường phát triển

- **Node.js**: >= 18.0.0
- **Database**: SQLite cho development
- **Authentication**: Clerk integration
- **Deployment**: Hỗ trợ Vercel và Heroku (Procfile)