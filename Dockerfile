# 1. Dùng image Node chính thức
FROM node:18

# 2. Tạo thư mục làm việc trong container
WORKDIR /app

# 3. Copy các file cấu hình trước (để tận dụng cache Docker tốt hơn)
COPY package*.json ./

# 4. Cài đặt thư viện
RUN npm install

# 5. Copy toàn bộ project vào container
COPY . .

# 6. Mở port (tuỳ theo app bạn dùng, thường là 3000 hoặc 5000)
EXPOSE 3000

# 7. Lệnh chạy app
CMD ["node", "server.js"]
