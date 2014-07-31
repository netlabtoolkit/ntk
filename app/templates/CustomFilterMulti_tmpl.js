<div class='inlets'>
    <div rv-each-inlet="widget:ins" rv-text="inlet.name" rv-data-field="inlet.fieldMap" class='inlet'></div>
</div>
<!-- <div class="inlet"><span class="unMap">×</span></div>-->
<div class="title dragHandle">
	{widget:title}
</div>
<span class="text" rv-text="widget:inTwo">Helllooo</span>
<textarea class="filterFunction" rv-value="widget:filter"/>
<span class="" rv-text="widget:outOne">Helllooo</span>

<!-- <div class="outlet" draggable='true'></div>-->
<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-text="outlet.name" rv-data-field="outlet.fieldMap"></div>
</div>
