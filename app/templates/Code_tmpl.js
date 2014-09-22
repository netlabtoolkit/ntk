<div class="widgetTop typeProcess">
    <div class="title dragHandle">
        {widget:title} <div class="remove">×</div>
    </div>
</div>

<div class="widgetLeft">
    <div class=left-tab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>

<div class="widgetBody">
    in1: <span class="text" rv-text="widget:inOne">Helllooo</span><br>
    in2: <span class="text" rv-text="widget:inTwo">Helllooo</span><br><br>
    
    out: <span class="" rv-text="widget:outOne">Helllooo</span>
</div>

<div class="widgetRight">
    <div class='outlets'>
        <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
    </div>
</div>
    
<div class="widgetBottom">
    <div class="tab"><p>more</p></div>
    <div class="content"><textarea class="filterFunction" rv-value="widget:filter"/></div>
</div>