<div class="widgetAuthoring">
    <div class="headerPorts headerStart"><div class="inlet headerPort" data-field="start" alt="trigger" title="trigger: play from the beginning when this rises past the threshold">&#9656;</div></div>
    <div class="headerPorts headerDone"><div class="outlet headerPort" data-field="out1" alt="next" title="next: pulses when the clip plays to its end" rv-class-ctlflash="widget:done">&#9656;</div></div>
    <div class="widgetTop typeMedia" rv-class-ctlrunning="widget:isPlaying">
        <div class="title dragHandle">
        <!--<input type="text" spellcheck="false" class="typeMedia" rv-value="widget:title"><div class="remove">×</div>-->
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:bodyIns" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>
    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:play | rounded">100</span> <span rv-text="widget:playText">Pause</span><span class="playToggle" rv-class-playing="widget:isPlaying" title="Play / pause"></span></div>
            <div class="inletValue"><span rv-text="widget:speed | rounded">100</span> Speed</div>
            <div class="inletValue"><span rv-text="widget:time | rounded">100</span> Time</div>
            <div class="inletValue"><span rv-text="widget:opacity | rounded">100</span> Opacity</div>

        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>loop</label> <input class="loop" type="checkbox" rv-checked="widget:loop" /><br>
            <label>continuous</label> <input class="continuous" type="checkbox" rv-checked="widget:continuous" /><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>width</label> <input class="displayWidth" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayWidth"><br>
            <label>video file</label> <input class="srcFile" type="text" rv-value="widget:srcFile"><br>
            <div class="browseVideo">Browse&hellip;</div>
            <div class="localVideoPath" rv-show="widget:localVideoPath" rv-text="widget:localVideoPath"></div>
<!--            <label>{widget:typeID} label</label> <input type="text" class="displayWidth" rv-value="widget:title"><br>-->
            <br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/video/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

<% if(!server) { %>
	<video class="detachedEl video" width="500"
        rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top">
        <source rv-src="widget:src" type="video/mp4">
	Your browser does not support the video element
	</video>
<% } %>
