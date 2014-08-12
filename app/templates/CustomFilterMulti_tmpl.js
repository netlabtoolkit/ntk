<div class='inlets'>
    <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
</div>
<div class="title dragHandle">
	{widget:title}
</div>
ONE: <span class="text" rv-text="widget:inOne">Helllooo</span>
TWO: <span class="text" rv-text="widget:inTwo">Helllooo</span>
<textarea class="filterFunction" rv-value="widget:filter"/>
<span class="" rv-text="widget:outOne">Helllooo</span>

<div class='outlets'>
    <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
</div>
