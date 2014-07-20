define([
	'chai',
	'views/AnalogOut',
	'backbone',
],
function( chai, Analogout, Backbone ) {

	describe('Analogout View', function () {
		var AnalogOut = new Analogout(),
			expect = chai.expect;

		it('should be an instance of Analogout View', function () {
			expect( AnalogOut ).to.be.an.instanceof( Analogout );
		});

		it('should have a default model', function(){
			expect( AnalogOut.model ).to.not.be.undefined;
			expect( AnalogOut.model ).to.be.an.instanceof( Backbone.Model );
		});

		it('should process all incoming data and output the result', function(){
			var number = Math.random() * 100;
			AnalogOut.model.set('in', number);

			expect( AnalogOut.model.get('out') ).to.equal(number);
		});
	});

});

