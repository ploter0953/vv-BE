# VtuberVerse Backend API

Backend API cho ứng dụng VtuberVerse, được xây dựng với Node.js, Express và SQLite.

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

### Development mode
```bash
npm run dev
```

### Production mode
```bash
npm start
```

Server sẽ chạy tại `http://localhost:5000`

## API Endpoints

### Authentication

#### POST /api/auth/register
Đăng ký tài khoản mới
```json
{
  "username": "string",
  "email": "string", 
  "password": "string"
}
```

#### POST /api/auth/login
Đăng nhập
```json
{
  "email": "string",
  "password": "string"
}
```

#### GET /api/auth/me
Lấy thông tin user hiện tại (cần token)

### Users

#### GET /api/users
Lấy danh sách tất cả users

#### GET /api/users/:id
Lấy thông tin user theo ID

#### GET /api/users/:id/commissions
Lấy danh sách commission của user

### Commissions

#### GET /api/commissions
Lấy danh sách tất cả commissions

#### GET /api/commissions/:id
Lấy thông tin commission theo ID

#### POST /api/commissions
Tạo commission mới (cần token)
```json
{
  "title": "string",
  "description": "string",
  "type": "number",
  "price": "number",
  "currency": "string",
  "deadline": "string",
  "requirements": ["string"],
  "examples": ["string"],
  "tags": ["string"]
}
```

## Database

Sử dụng SQLite với 2 bảng chính:

### Users
- id (PRIMARY KEY)
- username (UNIQUE)
- email (UNIQUE)
- password (hashed)
- avatar
- created_at

### Commissions
- id (PRIMARY KEY)
- title
- description
- type
- price
- currency
- status
- user_id (FOREIGN KEY)
- artist_name
- artist_avatar
- created_at
- deadline
- requirements (JSON)
- examples (JSON)
- tags (JSON)

## Security

- Passwords được hash bằng bcrypt
- JWT tokens cho authentication
- CORS enabled cho frontend
- Input validation

## Environment Variables

- `PORT`: Port server (default: 5000)
- `JWT_SECRET`: Secret key cho JWT (default: 'your-secret-key-change-in-production') 