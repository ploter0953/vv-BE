class CustomRedisStore {
  constructor(options) {
    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs || 60000; // Default 1 minute
  }

  async increment(key) {
    const fullKey = this.prefix + key;
    
    try {
      if (!this.client || !this.client.isReady) {
        throw new Error('Redis client not ready');
      }

      // Increment the key
      const current = await this.client.incr(fullKey);
      
      // Set expiration on first increment
      if (current === 1) {
        await this.client.pExpire(fullKey, this.windowMs);
      }
      
      // Get TTL for resetTime calculation
      const ttl = await this.client.pTTL(fullKey);
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + this.windowMs);
      
      return {
        totalHits: current,
        resetTime: resetTime
      };
    } catch (error) {
      console.error('Redis increment error:', error);
      throw error;
    }
  }

  async decrement(key) {
    const fullKey = this.prefix + key;
    
    try {
      if (!this.client || !this.client.isReady) {
        throw new Error('Redis client not ready');
      }

      const current = await this.client.decr(fullKey);
      return {
        totalHits: Math.max(0, current)
      };
    } catch (error) {
      console.error('Redis decrement error:', error);
      throw error;
    }
  }

  async resetKey(key) {
    const fullKey = this.prefix + key;
    
    try {
      if (!this.client || !this.client.isReady) {
        throw new Error('Redis client not ready');
      }

      await this.client.del(fullKey);
    } catch (error) {
      console.error('Redis resetKey error:', error);
      throw error;
    }
  }

  async resetAll() {
    try {
      if (!this.client || !this.client.isReady) {
        throw new Error('Redis client not ready');
      }

      const keys = await this.client.keys(this.prefix + '*');
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Redis resetAll error:', error);
      throw error;
    }
  }
}

module.exports = CustomRedisStore;