<div class='inlets'>
    <div rv-each-inlet="widget:ins" rv-title="inlet.name" rv-data-field="inlet.fieldMap" class='inlet'><strong>&middot;</div>
</div>
<div class="title dragHandle">
	{widget:title}
</div>
<!-- <input type="range" rv-value="widget:in" min="0" max="1023"/>
<select rv-selected="widget:activeControlParameter">
	<option rv-each-control="widget:controlParameters" rv-value="control.parameter" rv-text="control.name"></option>
</select>
<span class="text" rv-text="widget:in">Helllooo</span>
<img rv-style-activeControl="widget:in" class="element" rv-src="widget:src"/>-->
<img rv-style-opacity="widget:opacity"
	rv-positionx="widget:left"
	rv-positiony="widget:top"
	class="element" rv-src="widget:src"/>

<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-text="outlet.name" rv-data-field="outlet.fieldMap"></div>
</div>
