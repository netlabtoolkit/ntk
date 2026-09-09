<div class="widgetAuthoring">
    <div class="widgetTop typeAI">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" /></div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="transportControls">
                <div class="recordIcon" rv-class-recording="widget:recording" rv-class-countingdown="widget:countingDown" title="Record"></div>
                <select class="recordSlot" rv-value="widget:recordSlot">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
            </div>

            <div class="recordingMeter" rv-show="widget:recording">
                <div class="recordingBar" rv-widthpercent="widget:recordingProgress"></div>
            </div>
            <div class="recordingCountdown" rv-show="widget:recording | or widget:countingDown" rv-text="widget:recordingCountdownText"></div>

            <div class="cocoLabelReadout" rv-show="widget:cocoLabel">sees: <span rv-text="widget:cocoLabel"></span></div>
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
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to"><div class="dot">&middot;</div></div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <div class="recognitionMeter">
                <div class="recognitionBar" rv-widthpercent="widget:matchLevel"></div>
            </div>
            <div class="recognitionLabel">slot <span rv-text="widget:recordSlot">1</span>: <span rv-text="widget:matchLevel | rounded">0</span>%</div>
            <div class="exampleCount">slot <span rv-text="widget:recordSlot">1</span>: <span rv-text="widget:selectedExampleCount">0</span> examples</div>

            <img class="slotPreview" rv-src="widget:selectedPreview" width="70" height="70" alt="">
            <label class="wide-label">name</label> <input class="slotNameInput" type="text" rv-value="widget:selectedSlotName" placeholder="e.g. My mug"><br>

            <div class="recordTip">Recording lasts 5&nbsp;s. While the dot flashes red, <strong>slowly turn the object and move it closer and farther</strong> &mdash; a spread of views recognises much better than one still shot.</div>

            <div class="inletValue"><input class="ignorePeopleInput" type="checkbox" rv-checked="widget:ignorePeople" /> ignore people</div>
            <div class="inletValue"><input class="detectorCropInput" type="checkbox" rv-checked="widget:useDetectorCrop" /> focus on detected object</div>
            <button class="testImageButton" type="button">test with an image file&hellip;</button>

            <label class="wide-label">match threshold %</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="wide-label">wait time true</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeTrue"><br>
            <label class="wide-label">wait time false</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeFalse"><br>

            <div class="cameraPreview">
                <% if(!server) { %>
                <video class="objectVideo" width="190" height="143" autoplay muted playsinline></video>
                <canvas class="objectCanvas" width="190" height="143"></canvas>
                <% } %>
            </div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/objectrecog/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
