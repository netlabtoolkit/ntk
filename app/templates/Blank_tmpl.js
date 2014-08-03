<div class='inlets'>
    <div rv-each-inlet="widget:ins" rv-title="inlet.name" rv-data-field="inlet.fieldMap" class='inlet'>&middot;</div>
</div>
<div class="inlet"><span class="unMap">×</span></div>
<div class="title dragHandle">
	{widget:title}
</div>
In: <span class="text" rv-text="widget:in"></span>
Out: <span class="" rv-text="widget:out">Helllooo</span>

<div class="outlet" draggable='true'></div>
<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-text="outlet.name" rv-data-field="outlet.fieldMap"></div>
</div>
