<div class="widgetAuthoring">
    <div class="widgetTop typeGenerator">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="sceneMain">
            <button type="button" class="scenePlay" rv-class-playing="widget:scenePlaying" aria-label="Play or stop the scene" title="Play the scene from its first cue, or stop it (plays the idle lines)">
                <span class="scenePlayIcon">▶</span><span class="sceneStopIcon">■</span>
            </button>
            <div class="sceneCue" rv-text="widget:sceneCue"></div>
            <div class="sceneProgress" title="How far through the current cue"><div class="sceneProgressFill" rv-sceneprogress="widget:sceneProgress"></div></div>
            <div class="sceneStatus" rv-class-waiting="widget:sceneWaiting" rv-class-error="widget:sceneHasError" rv-text="widget:sceneStatus" rv-title="widget:sceneStatusTitle"></div>
        </div>
        <div class="sceneValues">
            <div class="sceneValue" rv-text="widget:v1" rv-title="widget:n1">0</div>
            <div class="sceneValue" rv-text="widget:v2" rv-title="widget:n2">0</div>
            <div class="sceneValue" rv-text="widget:v3" rv-title="widget:n3">0</div>
            <div class="sceneValue" rv-text="widget:v4" rv-title="widget:n4">0</div>
        </div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="wide-label">script</label>
            <div class="sceneEditor">
                <div class="sceneGutter" aria-hidden="true"></div>
                <div class="sceneRunMarks" aria-hidden="true"><div class="sceneRunMarksInner"></div></div>
                <textarea class="sceneScript" title="The scene script - takes effect when you click out of the box" rows="18" spellcheck="false" rv-value="widget:script"></textarea>
            </div>
            <ul class="sceneErrors">
                <li rv-each-err="widget:sceneErrors" rv-text="err" title="Click to go to this line"></li>
            </ul>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <input type="checkbox" rv-checked="widget:restartOnStart"> start over if start arrives while playing<br>
            <input type="checkbox" rv-checked="widget:stopOnStartLow" title="Like the stop inlet: plays the idle lines when start drops - so the scene runs only while start is held high (e.g. a button held down)"> stop when start goes below the threshold
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/scene/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
