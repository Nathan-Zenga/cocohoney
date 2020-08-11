// http://sixrevisions.com/javascript/browser-detection-javascript/
var browserDetect = {
    init: function () {
        // $(".button").click(function(){
            // Feature detection: Check if navigator.userAgent exists
            if (typeof navigator.userAgent === 'undefined') {
                browserDetect.showInfo('navigator.userAgent is not available in your browser.');
            // } else if ($(this).attr('id') === 'navigator-obj') {
            //   browserDetect.navigatorObj();
            } else {
                browserDetect.detectJS();
            }
        // });
    },
    // Display navigator.userAgent string in the message area
    navigatorObj: function () {
        browserDetect.showInfo(navigator.userAgent);
    },
    detectJS: function () {
        b = detect.parse(navigator.userAgent);
        // Display the Detect.js parsed properties in the message area
        browserDetect.showInfo(b.browser.name, b.device.type, b.os.name);
    },
    // Update message area with the string argument
    showInfo: function (browser, device, os) {
        console.log(browser);
        return 0;
    }
}
// Call browserDetect object when DOM is ready 
jQuery(document).ready(browserDetect.init);
