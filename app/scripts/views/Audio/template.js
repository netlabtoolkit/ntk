<div class="widgetAuthoring">
    <div class="widgetTop typeMedia">
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
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:play | rounded">100</span> <span rv-text="widget:playText">Pause</span></div>
            <div class="inletValue"><span rv-text="widget:volume | rounded">100</span> Volume</div>
            <div class="inletValue"><span rv-text="widget:speed | rounded">100</span> Speed</div>
            <div class="inletValue"><input class="loop" type="checkbox" rv-checked="widget:loop" /> Loop</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>continuous</label> <input class="continuous" type="checkbox" rv-checked="widget:continuous" /><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>audio file</label> <input type="text" rv-value="widget:src"><br>
        </div>
    </div>
</div>
  
<% if(!server) { %>
    <audio id="audio" rv-src="widget:src">
    Your browser does not support the audio element
    </audio>
<% } %>
