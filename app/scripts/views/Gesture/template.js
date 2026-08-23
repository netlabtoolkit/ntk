<div class="widgetAuthoring">
    <div class="widgetTop typeLogic">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" /></div>
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="dialwrapper" style="position:relative;">
                <div class="display invalue" rv-text="widget:in | rounded">0</div>
                <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
            </div>

            <div class="transportControls">
                <div class="recordIcon" rv-class-recording="widget:recording" rv-class-playing="widget:playing" title="Record"></div>
                <div class="playIcon" rv-class-playing="widget:playing" title="Play"></div>
            </div>

            <div class="recordControls">
                <select class="recordSlot" rv-value="widget:recordSlot">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
            </div>
        </div>
        <div class="widgetBodyRight">
            <div class="outletValue"><span class="out1Value" rv-text="widget:out1 | rounded" rv-class-matched="widget:matched1" rv-class-pending="widget:ifState1 | pending">0</span></div>
            <div class="outletValue"><span class="out2Value" rv-text="widget:out2 | rounded" rv-class-matched="widget:matched2" rv-class-pending="widget:ifState2 | pending">0</span></div>
            <div class="outletValue"><span class="out3Value" rv-text="widget:out3 | rounded" rv-class-matched="widget:matched3" rv-class-pending="widget:ifState3 | pending">0</span></div>
            <div class="outletValue"><span class="out4Value" rv-text="widget:out4 | rounded" rv-class-matched="widget:matched4" rv-class-pending="widget:ifState4 | pending">0</span></div>
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
            <div class="recognitionMeter" rv-class-capturing="widget:capturing">
                <div class="recognitionBar" rv-widthpercent="widget:recognitionLevel"></div>
            </div>
            <div class="recognitionLabel">
                <span rv-show="widget:capturing">capturing&hellip;</span>
                <span rv-hide="widget:capturing">slot <span rv-text="widget:recordSlot">1</span>: <span rv-text="widget:recognitionLevel | rounded">0</span>%</span>
            </div>

            <div class="templateLength">slot <span rv-text="widget:recordSlot">1</span> template: <span rv-text="widget:selectedTemplateLength">0</span> samples</div>
            <div class="statusMessage" rv-show="widget:statusMessage" rv-text="widget:statusMessage"></div>
            <label class="wide-label">match threshold %</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="wide-label">stillness ms</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:stillnessMs"><br>
            <label class="wide-label">wait time true</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeTrue"><br>
            <label class="wide-label">wait time false</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeFalse"><br>
            <label class="wide-label">match output</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:ifMatch | rounded"><br>
            <label class="wide-label">no match output</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:ifNoMatch | rounded"><br>
        </div>
    </div>
</div>
