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
    <div class="dialwrapper" style="position:relative;">
        <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
        <div class="display invalue" rv-text="widget:in">100</div>
        <div class="display outvalue" rv-text="widget:out">1023</div>
    </div>
    <br><div class='timeLeft'>Send in: 10s</div>
        
</div>


<div class="widgetBottom">
    <div class="tab"><p>more</p></div>
    <div class="content">
        send every <input type="text" rv-value="widget:sendPeriod"><br>
        public key <input class="keys" type="text" rv-value="widget:publicKey"><br>
        private key <input class="keys" type="text" rv-value="widget:privateKey"><br>
    </div>
</div>