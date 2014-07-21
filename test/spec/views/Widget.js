define([
	'chai',
	'backbone',
	'views/item/Widget',
],
function( chai, Backbone, WidgetView ) {

	describe('Widget View', function () {
		var widgetView = new WidgetView(),
			expect = chai.expect;

		it('should be an instance of Widget View', function () {
			expect( widgetView ).to.be.an.instanceof( WidgetView );
		});

		it('should have a default model', function(){
			expect( widgetView.model ).to.not.be.undefined;
			expect( widgetView.model ).to.be.an.instanceof( Backbone.Model );
		});

		it('should process all incoming data and output the result', function(){
			var number = Math.random() * 100;
			widgetView.model.set('in', number);

			expect( widgetView.model.get('out') ).to.equal(number);
		});
	});

});

