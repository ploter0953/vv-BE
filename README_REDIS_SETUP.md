# Redis Setup for Rate Limiting

## 🚀 Overview

This project now uses Redis for rate limiting instead of in-memory storage. Redis provides better scalability, persistence, and reliability for production environments.

## 📋 Prerequisites

- Node.js 18+
- Redis server (local or cloud)

## 🔧 Installation

### 1. Install Dependencies

```bash
npm install redis rate-limit-redis
```

### 2. Environment Variables

Add these variables to your `.env` file:

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password_here

# Rate Limiting (optional - defaults provided)
UPLOAD_RATE_LIMIT=10
UPLOAD_RATE_WINDOW=3600000
```

## 🏗️ Redis Setup Options

### Option 1: Local Redis (Development)

#### Install Redis on Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Install Redis on macOS:
```bash
brew install redis
brew services start redis
```

#### Install Redis on Windows:
Download from [Redis for Windows](https://github.com/microsoftarchive/redis/releases)

### Option 2: Cloud Redis (Production)

#### Redis Cloud (Recommended):
1. Sign up at [Redis Cloud](https://redis.com/try-free/)
2. Create a database
3. Get connection details
4. Update `REDIS_URL` in your `.env`

#### Other Cloud Providers:
- **AWS ElastiCache**: `redis://your-elasticache-endpoint:6379`
- **Google Cloud Memorystore**: `redis://your-memorystore-endpoint:6379`
- **Azure Cache for Redis**: `redis://your-azure-cache:6379`

## 🔍 Configuration Details

### Redis Connection Options:

```javascript
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
  retry_strategy: (options) => {
    // Retry configuration
    return Math.min(options.attempt * 100, 3000);
  }
});
```

### Rate Limiting Configuration:

```javascript
const uploadRateLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'upload_rate_limit:',
    sendCommand: (...args) => redisClient.sendCommand(args)
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour per user
  keyGenerator: (req) => req.auth?.userId || req.ip
});
```

## 🛡️ Fallback Mechanism

The system includes a fallback to in-memory rate limiting if Redis is unavailable:

```javascript
// If Redis is not available, fallback to in-memory
if (!redisClient.isReady) {
  // Use in-memory rate limiting
  if (!checkUploadRateLimit(req.auth.userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
}
```

## 📊 Monitoring

### Redis Connection Status:
- ✅ `Redis Client Connected` - Connection established
- ✅ `Redis Client Ready` - Ready to handle requests
- ❌ `Redis Client Error` - Connection issues
- ⚠️ `Falling back to in-memory rate limiting` - Redis unavailable

### Rate Limiting Headers:
- `X-RateLimit-Limit` - Maximum requests per window
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Time when limit resets

## 🚀 Production Deployment

### Render.com:
1. Add Redis add-on in your Render dashboard
2. Set `REDIS_URL` environment variable
3. Deploy your application

### Railway:
1. Add Redis service in Railway
2. Connect to your app
3. Set environment variables

### Heroku:
1. Add Redis add-on: `heroku addons:create heroku-redis:hobby-dev`
2. Set environment variables automatically

## 🔧 Troubleshooting

### Common Issues:

1. **Connection Refused**:
   - Check if Redis server is running
   - Verify `REDIS_URL` is correct
   - Check firewall settings

2. **Authentication Failed**:
   - Verify `REDIS_PASSWORD` is correct
   - Check Redis configuration

3. **Rate Limiting Not Working**:
   - Check Redis connection status
   - Verify rate limiter middleware is applied
   - Check environment variables

### Debug Commands:

```bash
# Test Redis connection
redis-cli ping

# Monitor Redis commands
redis-cli monitor

# Check Redis info
redis-cli info
```

## 📈 Performance Benefits

- **Scalability**: Works across multiple server instances
- **Persistence**: Rate limit data survives server restarts
- **Reliability**: Better error handling and recovery
- **Monitoring**: Built-in monitoring and metrics
- **Industry Standard**: Used by major companies worldwide

## 🔄 Migration from In-Memory

The system automatically migrates from in-memory to Redis:
1. No code changes required
2. Automatic fallback if Redis unavailable
3. Seamless transition
4. No data loss during migration