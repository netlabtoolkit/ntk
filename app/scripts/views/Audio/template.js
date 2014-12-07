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
        <div class="inletValue"><span rv-text="widget:play">100</span> Play</div>
        <div class="inletValue"><span rv-text="widget:volume">100</span> Volume</div>
        <div class="inletValue"><span rv-text="widget:speed">100</span> Speed</div>
        <div class="inletValue"><input id="loop" type="checkbox" rv-checked="widget:loop" /> Loop</div>
    </div>
</div>
        
<div class="widgetBottom">
    <div class="tab"><p>more</p></div>
    <div class="content">
        <label>continuous</label> <input id="continuous" type="checkbox" rv-checked="widget:continuous" /><br>
        <label>audio file</label> <input type="text" rv-value="widget:src"><br>
    </div>
</div>
  
<% if(!server) { %>
    <audio id="audio" rv-src="widget:src">
    Your browser does not support the audio element
    </audio>
<% } %>
