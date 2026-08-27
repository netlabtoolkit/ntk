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
            <div class="inletValue"><span rv-text="widget:left | rounded">100</span> X</div>
            <div class="inletValue"><span rv-text="widget:top | rounded">100</span> Y</div>
            <div class="inletValue"><span rv-text="widget:opacity | rounded">100</span> Opacity</div>
            <div class="inletValue"><span rv-text="widget:displayWidth | rounded">500</span> Width</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>width</label> <input class="displayWidth" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayWidth"><br>
            <label>image file</label> <input class="srcFile" type="text" rv-value="widget:srcFile"><br>
            <div class="browseImage">Browse&hellip;</div>
            <div class="localImagePath" rv-show="widget:localImagePath" rv-text="widget:localImagePath"></div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/image/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

<% if(!server) { %>
    <img class="detachedEl" rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top"
        class="element" rv-src="widget:src"/>
<% } %>
