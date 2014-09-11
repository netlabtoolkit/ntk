<div class="widget-top">
    <div class="title dragHandle">
        {widget:title} <div class="remove">×</div>
    </div>
</div>

<div class="widget-left">
    <div class=left-tab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>

<div class="widget-body">
    ONE: <span class="text" rv-text="widget:inOne">Helllooo</span><br>
    TWO: <span class="text" rv-text="widget:inTwo">Helllooo</span><br>
    
    <span class="" rv-text="widget:outOne">Helllooo</span>
</div>

<div class="widget-right">
    <div class='outlets'>
        <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
    </div>
</div>
    
<div class="widget-bottom">
    <textarea class="filterFunction" rv-value="widget:filter"/>
</div>