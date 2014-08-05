<div class='inlets'>
    <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
</div>
<div class="title dragHandle">
	{ widget:title }
</div>
<label><input type="checkbox" rv-checked="widget:active" >active</label>
<input type="range" rv-value="widget:in" min="0" max="255"/><br>
<span class="text" rv-text="widget:out">AnalogOut Value</span>

<!--<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-text="outlet.title" rv-data-field="outlet.to"></div>
</div>-->
