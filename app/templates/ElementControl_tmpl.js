<div class="widgetTop typeMedia">
    <div class="title dragHandle">
	{widget:title} <div class="remove">×</div>
    </div>
</div>
    
<div class="widgetLeft">
    <div class=leftTab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>
<div class="widgetBody">
</div>
<img class="detachedEl" rv-style-opacity="widget:opacity"
	rv-positionx="widget:left"
	rv-positiony="widget:top"
	class="element" rv-src="widget:src"/>

<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-text="outlet.title" rv-data-field="outlet.to"></div>
</div>
