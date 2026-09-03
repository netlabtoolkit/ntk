<div class="widgetAuthoring">
    <div class="widgetTop typeAI">
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

            <div class="currentMatch" rv-show="widget:currentMatchName" rv-text="widget:currentMatchName"></div>

            <div class="statusMessage" rv-show="widget:statusMessage" rv-text="widget:statusMessage"></div>
        </div>
        <div class="widgetBodyRight">
            <div class="slotIndicator" rv-class-matched="widget:matched1" rv-class-pending="widget:ifState1 | pending" rv-matchcolor="widget:dotColor1"></div>
            <div class="slotIndicator" rv-class-matched="widget:matched2" rv-class-pending="widget:ifState2 | pending" rv-matchcolor="widget:dotColor2"></div>
            <div class="slotIndicator" rv-class-matched="widget:matched3" rv-class-pending="widget:ifState3 | pending" rv-matchcolor="widget:dotColor3"></div>
            <div class="slotIndicator" rv-class-matched="widget:matched4" rv-class-pending="widget:ifState4 | pending" rv-matchcolor="widget:dotColor4"></div>
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

            <div class="allLevels">1: <span rv-text="widget:level1 | rounded">0</span>%&nbsp; 2: <span rv-text="widget:level2 | rounded">0</span>%&nbsp; 3: <span rv-text="widget:level3 | rounded">0</span>%&nbsp; 4: <span rv-text="widget:level4 | rounded">0</span>%</div>

            <div class="templateLength">slot <span rv-text="widget:recordSlot">1</span> template: <span rv-text="widget:selectedTemplateLength">0</span> samples</div>

            <canvas class="slotPreview" width="70" height="70"></canvas>
            <label class="wide-label">name</label> <input class="slotNameInput" type="text" rv-value="widget:selectedSlotName" placeholder="e.g. Wave hello"><br>

            <label class="wide-label">match threshold %</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="wide-label">stillness ms</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:stillnessMs"><br>
            <label class="wide-label">wait time true</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeTrue"><br>
            <label class="wide-label">wait time false</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeFalse"><br>
            <table class="rangeTable gestureOutputsTable" border="0" cellspacing="3" cellpadding="0">
                <tr>
                    <td></td>
                    <td class="tableHeader">no match</td>
                    <td class="tableHeader">match</td>
                </tr>
                <tr>
                    <td>1</td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifNoMatch1 | rounded"></td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifMatch1 | rounded"></td>
                </tr>
                <tr>
                    <td>2</td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifNoMatch2 | rounded"></td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifMatch2 | rounded"></td>
                </tr>
                <tr>
                    <td>3</td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifNoMatch3 | rounded"></td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifMatch3 | rounded"></td>
                </tr>
                <tr>
                    <td>4</td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifNoMatch4 | rounded"></td>
                    <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:ifMatch4 | rounded"></td>
                </tr>
            </table>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/gesture/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
