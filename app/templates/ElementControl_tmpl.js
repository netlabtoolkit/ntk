<div class="inlet"><span class="unMap">×</span></div>
<div class="title dragHandle">
	{widget:title}
</div>
<input type="range" rv-value="widget:in" min="0" max="1023"/>
<select rv-selected="widget:activeControlParameter">
	<option rv-each-control="widget:controlParameters" rv-value="control.parameter" rv-text="control.name"></option>
</select>
<span class="text" rv-text="widget:in">Helllooo</span>
<img rv-style-activeControl="widget:in" class="element" rv-src="widget:src"/>

