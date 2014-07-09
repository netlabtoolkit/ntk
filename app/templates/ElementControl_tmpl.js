<div class="inlet"><span class="unMap">×</span></div>
<div class="title dragHandle">
	{widget:title}
</div>
<input type="range" rv-value="widget:in"/>
<span class="text" rv-text="widget:in">Helllooo</span>
<select rv-selected="widget:activeControlParameter">
	<option rv-each-control="widget:controlParameters" rv-value="control.parameter" rv-text="control.name"></option>
</select>

<img rv-style-activeControl="widget:in" class="element" rv-src="widget:src"/>

