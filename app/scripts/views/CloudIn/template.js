<div class="widgetTop typeIn">
    <div class="title dragHandle">
	{ widget:title } <div class="remove">×</div>
    </div>
</div>

<div class="widgetLeft">
    <div class=leftTab><input type="checkbox" rv-checked="widget:getFromCloud" /></div>
</div>
        
<div class="widgetBody">
    <div class="dialwrapper" style="position:relative;">
        <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>

        <div class="display outvalue" rv-text="widget:out">1023</div>
    </div>
    <br><div class='timeLeft'>Get in: 10s</div>
        
</div>
    
<div class="widgetRight">
    <div class='outlets'>
        <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
    </div>
</div>


<div class="widgetBottom">
    <div class="tab"><p>more</p></div>
    <div class="content">
        <label>get every</label> <input type="text" rv-value="widget:getPeriod"><br>
        <label>public key</label> <input class="keys" type="text" rv-value="widget:publicKey"><br>
    </div>
</div>