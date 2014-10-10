<div class="widgetTop typeOut">
    <div class="title dragHandle">
	{ widget:title } <div class="remove">×</div>
    </div>
</div>

<div class="widgetLeft">
    <div class=leftTab><label><input type="checkbox" rv-checked="widget:active" ></label></div>
    <div class='inlets'>
        <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
    </div>
</div>
        
<div class="widgetBody">
    <!-- 
    <span class="text" rv-text="widget:in">Blank In Value</span><br>
    <input type="range" rv-value="widget:in" min="0" max="1023"/><br>
    <span class="text" rv-text="widget:out">Blank Out Value</span>
    -->
    <div class="dialwrapper" style="position:relative;">
        <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
        <div class="display invalue" rv-text="widget:in">100</div>
        <div class="display outvalue" rv-text="widget:out">1023</div>
    </div>
</div>

<div class="widgetRight">
    <div class=rightTab><input type="checkbox" rv-checked="widget:active" /></div>
    <div class=rightTab>
        <div class='settings'>
            <input type='text' value='D3'>
        </div>
        <!-- <div rv-each-source="sources" class="settings">
            <input rv-value="source.map.sourceField">
        </div> -->
    </div>
</div>
