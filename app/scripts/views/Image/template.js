<div class="widgetTop typeMedia">
    <div class="title dragHandle">
	{widget:title} <div class="remove">×</div>
    </div>
</div>
    
<div class="widgetLeft">
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>
<div class="widgetBody">
    <div class="widgetBodyLeft">
        <div class="inletValue"><span rv-text="widget:left">100</span> X</div>
        <div class="inletValue"><span rv-text="widget:top">100</span> Y</div>
        <div class="inletValue"><span rv-text="widget:opacity">100</span> Opacity</div>
    </div>
</div>
<img class="detachedEl" rv-style-opacity="widget:opacity"
	rv-positionx="widget:left"
	rv-positiony="widget:top"
	class="element" rv-src="widget:src"/>

