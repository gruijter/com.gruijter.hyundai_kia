/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

$(document).ready(async () => {
	$('#hy-views').css('position', 'static');
	Homey.setTitle(Homey.__('pair.start'));
});

// $('#hy-nav-next').click(async () => {
async function submit() {
	try {
		const region = $('#region').val();
		const username = $('#username').val().trim();
		const password = $('#password').val().trim();
		const pin = $('#pin').val().trim();

		if (username === '' || password === '' || pin.length !== 4) {
			throw Error(__('pair.required'));
		}
		const settings = {
			region,
			username,
			password,
			pin,
		};
		// Continue to back-end, pass along data
		Homey.setTitle(Homey.__('pair.validating'));
		Homey.showLoadingOverlay();
		await Homey.emit('validate', settings);
		Homey.hideLoadingOverlay();
		$('#hy-views').css('position', 'relative');
		Homey.showView('list_devices');
	} catch (error) {
		Homey.setTitle(Homey.__('pair.start'));
		Homey.hideLoadingOverlay();
		Homey.alert(error, 'error');
	}
}
