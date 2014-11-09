<div class="widgetTop typeOut">
    <div class="title dragHandle">
	{ widget:title } <div class="remove">×</div>
    </div>
</div>
    
<div class="widgetLeft">
    <div class=leftTab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>

<div class="widgetBody">
    <div class="dialwrapper" style="position:relative;">
        <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
        <div class="display invalue" rv-text="widget:in">100</div>
        <div class="display outvalue" rv-text="widget:out">1023</div>
    </div>
</div>

<div class="widgetRight">
    <div class=rightTab><input type="checkbox" rv-checked="widget:active" /></div>
    <div class=rightTab>
        <div rv-each-source="sources" class='settings'>
            <input rv-value="source.map.destinationField">
        </div>
    </div>
</div>