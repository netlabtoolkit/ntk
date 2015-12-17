<div class="widgetAuthoring">
    <div class="widgetTop typeMedia">
        <div class="title dragHandle">
        <!--<input type="text" spellcheck="false" class="typeMedia" rv-value="widget:title"><div class="remove">×</div>-->
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>
    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:play | rounded">100</span> <span rv-text="widget:playText">Pause</span></div>
            <div class="inletValue"><span rv-text="widget:speed | rounded">100</span> Speed</div>
            <div class="inletValue"><span rv-text="widget:time | rounded">100</span> Time</div>
            <div class="inletValue"><span rv-text="widget:opacity | rounded">100</span> Opacity</div>
            
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>loop</label> <input class="continuous" type="checkbox" rv-checked="widget:loop" /><br>
            <label>continuous</label> <input class="continuous" type="checkbox" rv-checked="widget:continuous" /><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>width</label> <input class="displayWidth" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayWidth"><br>
            <label>video file</label> <input class="videosrc" type="text" rv-value="widget:srcmp4">
<!--            <label>{widget:typeID} label</label> <input type="text" class="displayWidth" rv-value="widget:title"><br>-->
            <br>
        </div>
    </div>
</div>
        
<% if(!server) { %>
	<video class="detachedEl video" width="500" 
        rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top">
        <source rv-src="widget:srcmp4" type="video/mp4">
        <source rv-src="widget:srcogg" type="video/ogg">
	Your browser does not support the video element
	</video>
<% } %>

