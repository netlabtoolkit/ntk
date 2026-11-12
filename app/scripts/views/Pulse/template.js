<div class="widgetAuthoring">
    <div class="headerPorts headerStart"><div class="inlet headerPort" data-field="inTrigger" alt="trigger" title="trigger: play the number of pulses set in the more panel (1 by default) when this rises past the threshold">&#9656;</div></div>
    <div class="headerPorts headerDone"><div class="outlet headerPort" data-field="out2" alt="next" title="next: pulses when a trigger's last pulse cycle ends" rv-class-ctlflash="widget:done">&#9656;</div></div>
    <div class="widgetTop typeAnimation" rv-class-ctlrunning="widget:bursting">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:bodyIns" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
                
            <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:timerLength | rounded"></div>
            <div class="pulseCountdown" rv-text="widget:countdown" title="time left until next, while triggered pulses play"></div>
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
            <div class="outlet" rv-each-outlet="widget:bodyOuts" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>% time on</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:timerHighPercentage"><br>
            <label title="how many pulses the trigger port plays; next pulses when the last one's cycle ends">pulses</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:triggerPulses" title="how many pulses the trigger port plays; next pulses when the last one's cycle ends"><br>
            <hr>
            Random Settings<br>
            <input type="checkbox" rv-checked="widget:randOutPulse" title="with rand out on: ticked, the output drops to the low value between random values; unticked, it steps straight from one random value to the next" /> drop to low between<br>
            <label>out range</label> <input class="moreParam" type="text" rv-value="widget:randLow">
            <input class="moreParam" type="text" rv-value="widget:randHigh"><br>
            
            <label>time range</label> <input class="moreParam" type="text" rv-value="widget:randTimeLow">
            <input class="moreParam" type="text" rv-value="widget:randTimeHigh">
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/pulse/" target="_blank">Widget help</a>
        </div>
    </div>
</div>