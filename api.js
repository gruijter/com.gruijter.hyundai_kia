module.exports = {
	// retrieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	// cloud refresh
	async forceLive({ homey, query }) {
		const result = await homey.app.remoteRefresh(query);
		return result;
	},
};
