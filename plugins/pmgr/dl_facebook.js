const axios = require('axios');
const mime = require('mime-types');

module.exports = {
    admin: false,
    name: 'facebookdl',
    alias: ['fb', 'facebook', 'facebookdl'],
    category: 'downloader',
    run: async (m) => {
        const url = m.text ? m.text.trim() : null;

        // Check if URL is provided
        if (!url) {
            const text = m.sender.user.startsWith('62')
                ? `Untuk menggunakan fitur ini gunakan perintah seperti berikut.\n\n${m.prefix + m.cmd} <url>`
                : `To use this feature, use the following command.\n\n${m.prefix + m.cmd} <url>`;
            return await m.reply(text);
        }

        // Validate URL format
        const urlRegex = /[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i;
        if (!urlRegex.test(url)) {
            return await m.reply('Invalid URL format. Please check and try again.');
        }

        try {
            // Prepare the API request
            const apiUrl = `https://exampleapi.com/fbdownloader?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl);

            // Extract download links
            const { data } = response;
            const downloadUrl = data.downloads.find(d => d.format_id === "hd")?.url || data.downloads.find(d => d.format_id === "sd")?.url;

            // If no download link found, return an error
            if (!downloadUrl) {
                return await m.reply('No download link found for the provided URL.');
            }

            // Send the video to the user
            await m.reply({
                video: {
                    url: downloadUrl
                },
                mimetype: mime.contentType("mp4"),
                caption: `URL: ${url}\n\nHere is your download.`,
                gifPlayback: false
            });
        } catch (error) {
            console.error('Error:', error);
            return await m.reply('An error occurred while processing your request. Please try again.');
        }
    }
};
