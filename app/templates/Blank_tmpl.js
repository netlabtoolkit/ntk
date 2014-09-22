<div class="widgetTop typeProcess">
    <div class="title dragHandle">
	{ widget:title } <div class="remove">×</div>
    </div>
</div>

<div class="widgetLeft">
    <div class=left-tab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>
        
<div class="widgetBody">
    <span class="text" rv-text="widget:in">Blank In Value</span><br>
    <input type="range" rv-value="widget:in" min="0" max="1023"/><br>
    <span class="text" rv-text="widget:out">Blank Out Value</span>
</div>

<div class="widgetRight">
    <div class='outlets'>
        <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
    </div>
</div>
