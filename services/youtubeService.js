const axios = require('axios');

class YouTubeService {
  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 phút cache
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 giây
  }

  // Cache management
  getCacheKey(videoId, type = 'status') {
    return `${videoId}_${type}`;
  }

  getFromCache(key, timeout = null) {
    const cached = this.cache.get(key);
    const cacheTimeout = timeout || this.cacheTimeout;
    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Retry mechanism
  async retryOperation(operation, attempts = this.retryAttempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
      }
    }
  }

  // Extract video ID from YouTube URL
  extractVideoId(url) {
    if (!url) return null;
    
    const patterns = [
      // youtube.com/watch?v=VIDEO_ID
      /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
      // youtu.be/VIDEO_ID (with or without query parameters)
      /(?:youtu\.be\/)([^&\n?#]+)/,
      // youtube.com/embed/VIDEO_ID
      /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
      // youtube.com/live/VIDEO_ID
      /(?:youtube\.com\/live\/)([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        // Return the video ID (first 11 characters for YouTube video IDs)
        const videoId = match[1];
        // YouTube video IDs are always 11 characters
        if (videoId && videoId.length >= 11) {
          return videoId.substring(0, 11);
        }
        return videoId;
      }
    }
    
    return null;
  }

  // Check if stream is in waiting room status
  async checkStreamStatus(videoId, cacheTimeout = null) {
    if (!this.apiKey || !videoId) {
      throw new Error('YouTube API key or video ID not provided');
    }

    // Use custom cache timeout if provided, otherwise use default
    const timeout = cacheTimeout || this.cacheTimeout;

    // Check cache first
    const cacheKey = this.getCacheKey(videoId, 'status');
    const cached = this.getFromCache(cacheKey, timeout);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.retryOperation(async () => {
        return await axios.get(`${this.baseUrl}/videos`, {
          params: {
            part: 'snippet,status,statistics,liveStreamingDetails',
            id: videoId,
            key: this.apiKey
          }
        });
      });

      if (!response.data.items || response.data.items.length === 0) {
        return {
          isValid: false,
          isWaitingRoom: false,
          isLive: false,
          error: 'Video not found'
        };
      }

      const video = response.data.items[0];
      const snippet = video.snippet;
      const status = video.status;
      const liveStreamingDetails = video.liveStreamingDetails;
      const statistics = video.statistics;

      // Check if it's a live stream
      if (snippet.liveBroadcastContent !== 'live' && snippet.liveBroadcastContent !== 'upcoming') {
        return {
          isValid: false,
          isWaitingRoom: false,
          isLive: false,
          error: 'Not a live stream'
        };
      }

      // Check if it's in waiting room (upcoming) or already live
      const isWaitingRoom = snippet.liveBroadcastContent === 'upcoming';
      const isLive = snippet.liveBroadcastContent === 'live';

              const result = {
          isValid: true,
          isWaitingRoom,
          isLive,
          title: snippet.title,
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
          viewCount: parseInt(statistics?.viewCount || '0'),
          scheduledStartTime: liveStreamingDetails?.scheduledStartTime,
          actualStartTime: liveStreamingDetails?.actualStartTime,
          actualEndTime: liveStreamingDetails?.actualEndTime
        };

        // Cache the result
        this.setCache(cacheKey, result);
        return result;
      } catch (error) {
        console.error('YouTube API error:', error.response?.data || error.message);
        
        // Return cached data if available, even if expired
        const expiredCache = this.cache.get(cacheKey);
        if (expiredCache) {
          console.log('Returning expired cache due to API error');
          return expiredCache.data;
        }

        return {
          isValid: false,
          isWaitingRoom: false,
          isLive: false,
          error: 'YouTube API error'
        };
      }
    }

  // Get stream info for display
  async getStreamInfo(videoId) {
    if (!this.apiKey || !videoId) {
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,statistics,liveStreamingDetails',
          id: videoId,
          key: this.apiKey
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        return null;
      }

      const video = response.data.items[0];
      const snippet = video.snippet;
      const statistics = video.statistics;
      const liveStreamingDetails = video.liveStreamingDetails;

      return {
        title: snippet.title,
        thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
        viewCount: parseInt(statistics?.viewCount || '0'),
        isLive: snippet.liveBroadcastContent === 'live',
        scheduledStartTime: liveStreamingDetails?.scheduledStartTime,
        actualStartTime: liveStreamingDetails?.actualStartTime
      };
    } catch (error) {
      console.error('Error getting stream info:', error.message);
      return null;
    }
  }

  // Validate YouTube URL
  validateYouTubeUrl(url) {
    if (!url) return false;
    
    const videoId = this.extractVideoId(url);
    return videoId !== null;
  }
}

const instance = new YouTubeService();
instance.isValidYouTubeUrl = instance.validateYouTubeUrl.bind(instance);

module.exports = instance;