<div class="widgetAuthoring">
    <div class="widgetTop typeGenerator">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
                
            <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:timerLength | rounded"></div>
        </div>
        <div class="widgetBodyRight">
            <div class="outletValue">
                <input class="pulseLow" class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:pulseLow | rounded">
                <input class="pulseHigh" class="outputParam" type="text" pattern="[0-9]*" rv-value="widget:pulseHigh | rounded">
            </div>
        </div>
        <br><br><br><br><br>
        <div>
            <label>rand out</label><input type="checkbox" rv-checked="widget:randOut" /><br>
            <label>rand time</label><input type="checkbox" rv-checked="widget:randTime" /><br>
        </div>     

    </div>
    
    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>% time on</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:timerHighPercentage"><br>
            <hr>
            Random Settings<br>
            <label>out pulse</label><input type="checkbox" rv-checked="widget:randOutPulse" /><br>
            <label>out range</label> <input class="moreParam" type="text" rv-value="widget:randLow">
            <input class="moreParam" type="text" rv-value="widget:randHigh"><br>
            
            <label>time range</label> <input class="moreParam" type="text" rv-value="widget:randTimeLow">
            <input class="moreParam" type="text" rv-value="widget:randTimeHigh">
        </div>
    </div>
</div>