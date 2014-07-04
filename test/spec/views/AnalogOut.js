(function() {
	'use strict';

	var root = this;

	root.define([
		'views/AnalogOut'
		],
		function( Analogout ) {

			describe('Analogout View', function () {

				it('should be an instance of Analogout View', function () {
					var AnalogOut = new Analogout();
					expect( AnalogOut ).to.be.an.instanceof( Analogout );
				});

				it('should have more test written', function(){
					expect( false ).to.be.ok;
				});
			});

		});

}).call( this );