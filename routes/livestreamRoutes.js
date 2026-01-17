const express = require('express');
const router = express.Router();
const User = require('../models/User');
const youtubeService = require('../services/youtubeService');

// Helper function to extract channel ID from YouTube URL
function extractChannelId(youtubeUrl) {
    if (!youtubeUrl) return null;

    // Pattern for youtube.com/channel/CHANNEL_ID
    const channelPattern = /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/;
    // Pattern for youtube.com/@USERNAME
    const handlePattern = /youtube\.com\/@([a-zA-Z0-9_-]+)/;
    // Pattern for youtube.com/c/CUSTOM_URL
    const customPattern = /youtube\.com\/c\/([a-zA-Z0-9_-]+)/;

    let match = youtubeUrl.match(channelPattern);
    if (match) return match[1];

    match = youtubeUrl.match(handlePattern);
    if (match) return `@${match[1]}`; // Return with @ for handle

    match = youtubeUrl.match(customPattern);
    if (match) return match[1];

    return null;
}

// Helper function to search for live/upcoming streams by channel
async function searchChannelStreams(channelId) {
    if (!youtubeService.apiKey) {
        return [];
    }

    try {
        const axios = require('axios');

        // Search for live streams
        const liveResponse = await axios.get(`${youtubeService.baseUrl}/search`, {
            params: {
                part: 'snippet',
                channelId: channelId,
                eventType: 'live',
                type: 'video',
                key: youtubeService.apiKey,
                maxResults: 5
            },
            timeout: 10000
        });

        // Search for upcoming streams
        const upcomingResponse = await axios.get(`${youtubeService.baseUrl}/search`, {
            params: {
                part: 'snippet',
                channelId: channelId,
                eventType: 'upcoming',
                type: 'video',
                key: youtubeService.apiKey,
                maxResults: 5
            },
            timeout: 10000
        });

        const liveStreams = liveResponse.data.items || [];
        const upcomingStreams = upcomingResponse.data.items || [];

        return [...liveStreams, ...upcomingStreams];
    } catch (error) {
        console.error(`Error searching streams for channel ${channelId}:`, error.message);
        return [];
    }
}

// GET /api/livestreams - Get all active livestreams from VTubers
router.get('/', async (req, res) => {
    try {
        // Find all users with 'vtuber' badge and YouTube channel
        const vtubers = await User.find({
            badges: 'vtuber',
            youtube: { $exists: true, $ne: '' }
        }).select('_id username avatar youtube').lean();

        if (vtubers.length === 0) {
            return res.json({ livestreams: [] });
        }

        const livestreams = [];

        // Process each VTuber
        for (const vtuber of vtubers) {
            const channelId = extractChannelId(vtuber.youtube);
            if (!channelId) continue;

            // Search for streams
            const streams = await searchChannelStreams(channelId);

            // Process each stream
            for (const stream of streams) {
                const videoId = stream.id.videoId;

                // Get detailed stream info
                const streamStatus = await youtubeService.checkStreamStatus(videoId, 60000); // 60s cache

                if (streamStatus.isValid && (streamStatus.isLive || streamStatus.isWaitingRoom)) {
                    livestreams.push({
                        streamId: videoId,
                        vtuber: {
                            userId: vtuber._id,
                            username: vtuber.username,
                            avatar: vtuber.avatar
                        },
                        stream: {
                            title: streamStatus.title,
                            thumbnail: streamStatus.thumbnail,
                            status: streamStatus.isLive ? 'live' : streamStatus.isWaitingRoom ? 'upcoming' : 'waiting',
                            scheduledStartTime: streamStatus.scheduledStartTime,
                            actualStartTime: streamStatus.actualStartTime,
                            viewerCount: streamStatus.viewCount || 0
                        }
                    });
                }
            }
        }

        // Sort: Live first, then upcoming
        livestreams.sort((a, b) => {
            if (a.stream.status === 'live' && b.stream.status !== 'live') return -1;
            if (a.stream.status !== 'live' && b.stream.status === 'live') return 1;
            return 0;
        });

        res.json({ livestreams });
    } catch (error) {
        console.error('Error fetching livestreams:', error);
        res.status(500).json({
            error: 'Không thể tải danh sách livestream',
            livestreams: []
        });
    }
});

// GET /api/livestreams/:streamId - Get specific livestream details
router.get('/:streamId', async (req, res) => {
    try {
        const { streamId } = req.params;

        // Get stream info from YouTube
        const streamInfo = await youtubeService.checkStreamStatus(streamId, 30000); // 30s cache

        if (!streamInfo.isValid) {
            return res.status(404).json({ error: 'Stream không tồn tại hoặc đã kết thúc' });
        }

        // Try to find the VTuber who owns this stream
        // This is a best-effort search
        const vtubers = await User.find({
            badges: 'vtuber',
            youtube: { $exists: true, $ne: '' }
        }).select('_id username avatar youtube bio').lean();

        let vtuberInfo = null;

        // We can't easily match stream to VTuber without channel ID in stream data
        // So we'll return stream info without VTuber details for now
        // Frontend can pass vtuber info if coming from main list

        res.json({
            streamId,
            stream: {
                title: streamInfo.title,
                thumbnail: streamInfo.thumbnail,
                status: streamInfo.isLive ? 'live' : streamInfo.isWaitingRoom ? 'upcoming' : 'waiting',
                scheduledStartTime: streamInfo.scheduledStartTime,
                actualStartTime: streamInfo.actualStartTime,
                viewerCount: streamInfo.viewCount || 0
            },
            vtuber: vtuberInfo
        });
    } catch (error) {
        console.error('Error fetching stream details:', error);
        res.status(500).json({ error: 'Không thể tải thông tin stream' });
    }
});

module.exports = router;
