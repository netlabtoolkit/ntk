(function() {
	'use strict';

	var root = this;

	root.define([
		'collections/Widgets'
		],
		function( Widgets ) {

			describe('Widgets Collection', function () {

				it('should be an instance of Widgets Collection', function () {
					var Widgets = new Widgets();
					expect( Widgets ).to.be.an.instanceof( Widgets );
				});

				it('should have more test written', function(){
					expect( false ).to.be.ok;
				});
			});

		});

}).call( this );