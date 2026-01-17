const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Vote = require('../models/Vote');

// GET /api/spotlight/vtubers - Get top 5 VTubers by vote count
router.get('/vtubers', async (req, res) => {
    try {
        // Aggregate votes to get top VTubers
        const topVTubers = await Vote.aggregate([
            {
                $group: {
                    _id: '$voted_vtuber_id',
                    voteCount: { $sum: 1 }
                }
            },
            { $sort: { voteCount: -1 } },
            { $limit: 5 }
        ]);

        // Populate user details
        const vtuberIds = topVTubers.map(v => v._id);
        const users = await User.find({ _id: { $in: vtuberIds } })
            .select('username avatar bio badges vtuber_description')
            .lean();

        // Merge vote counts with user data
        const spotlight = users.map(user => {
            const voteData = topVTubers.find(v => v._id.toString() === user._id.toString());
            return {
                ...user,
                voteCount: voteData ? voteData.voteCount : 0
            };
        }).sort((a, b) => b.voteCount - a.voteCount);

        res.json({ spotlight });
    } catch (error) {
        console.error('Error fetching spotlight VTubers:', error);
        res.status(500).json({ error: 'Không thể tải spotlight VTubers' });
    }
});

// GET /api/spotlight/artists - Get top 5 Artists by vote count
router.get('/artists', async (req, res) => {
    try {
        // Aggregate votes to get top Artists
        const topArtists = await Vote.aggregate([
            {
                $group: {
                    _id: '$voted_artist_id',
                    voteCount: { $sum: 1 }
                }
            },
            { $sort: { voteCount: -1 } },
            { $limit: 5 }
        ]);

        // Populate user details
        const artistIds = topArtists.map(a => a._id);
        const users = await User.find({ _id: { $in: artistIds } })
            .select('username avatar bio badges artist_description')
            .lean();

        // Merge vote counts with user data
        const spotlight = users.map(user => {
            const voteData = topArtists.find(a => a._id.toString() === user._id.toString());
            return {
                ...user,
                voteCount: voteData ? voteData.voteCount : 0
            };
        }).sort((a, b) => b.voteCount - a.voteCount);

        res.json({ spotlight });
    } catch (error) {
        console.error('Error fetching spotlight Artists:', error);
        res.status(500).json({ error: 'Không thể tải spotlight Artists' });
    }
});

module.exports = router;
