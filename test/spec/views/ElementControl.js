(function() {
	'use strict';

	var root = this;

	root.define([
		'views/ElementControl'
		],
		function( Elementcontrol ) {

			describe('Elementcontrol View', function () {

				it('should be an instance of Elementcontrol View', function () {
					var ElementControl = new Elementcontrol();
					expect( ElementControl ).to.be.an.instanceof( Elementcontrol );
				});

				it('should have more test written', function(){
					expect( false ).to.be.ok;
				});
			});

		});

}).call( this );