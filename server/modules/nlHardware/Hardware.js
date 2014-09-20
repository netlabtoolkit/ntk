

module.exports = function(options) {
    var deviceType = options.deviceType || 'arduino';
    var modelMap = {
        arduino: './ArduinoModel',
    };

    var model = require(modelMap[deviceType])();
    var five = require("johnny-five");
    var board = five.Board();

    return model;
}
