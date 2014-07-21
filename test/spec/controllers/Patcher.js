define([
	'chai',
	'backbone',
	'models/Hardware',
	'controllers/Patcher',
],
function( chai, Backbone, HardwareModel, Patcher ) {

	describe('Patcher Controller', function () {
		var region = new Backbone.Marionette.Region({el: '#testElement'});
		var patcher = new Patcher(region),
			expect = chai.expect;

		it('should be an instance of Patcher', function () {
			expect( patcher ).to.be.an.instanceof( Patcher );
		});

		it('should get an appropriate hardware model instance', function(){
			expect( patcher ).to.not.be.undefined;

			var hardwareModel = patcher.getHardwareModelInstance('ArduinoUno', 'localhost');

			expect( hardwareModel ).to.not.be.undefined;
			expect( hardwareModel ).to.be.an.instanceof( HardwareModel );
		});

	});

});

