define([
	'chai',
	'backbone',
	'views/ElementControl'
],
function( chai, Backbone, Elementcontrol ) {
	var expect = chai.expect;

	describe('Elementcontrol View', function () {
		var ElementControl = new Elementcontrol();

		it('should be an instance of Elementcontrol View', function () {
			expect( ElementControl ).to.be.an.instanceof( Elementcontrol );
		});

		it('should have a default model', function(){
			expect( ElementControl.model ).to.not.be.undefined;
			expect( ElementControl.model ).to.be.an.instanceof( Backbone.Model );
		});

		it('should process all incoming data and output the result', function(){
			var number = Math.random() * 100;
			ElementControl.model.set('in', number);

			expect( ElementControl.model.get('out') ).to.equal(number);
		});
	});

});

