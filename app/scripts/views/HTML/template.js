<div class="widgetAuthoring">
    <div class="widgetTop typeUI">
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
            <div class="inletValue"><span rv-text="widget:text"></span> Input Element</div>
            <div class="inletValue"><span rv-text="widget:left | rounded">100</span> X</div>
            <div class="inletValue"><span rv-text="widget:top | rounded">100</span> Y</div>
            <div class="inletValue"><span rv-text="widget:opacity | rounded">100</span> Opacity</div>
        </div>
    </div>
            
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class='wide-label'>Input element property</label>
            <select class="inputProperty" rv-value="widget:inputProperty">
                <option value="width">width</option>
                <option value="height">height</option>
                <option value="scale">scale</option>
                <option value="bgcolor">bgcolor</option>
                <option value="text">text</option>
                <option value="html">html</option>
            </select><br>
            <label class='wide-label'>Input element class</label><input  type="text" rv-value="widget:inputElementClass"><br>
            <label class='wide-label'>HTML wrapper class</label><input type="text" rv-value="widget:displayClass"><br>
            HTML<br>
            <textarea class="userHtml" rv-value="widget:userHtml" rows="6" cols="70"></textarea><br>
            CSS<br>
            <textarea class="userCss" rv-value="widget:userCss" rows="6" cols="70"></textarea>
        </div>
    </div>

</div>
        
<% if(!server) { %>
	<div class="detachedEl" rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top">
        <style rv-html="widget:userCss"></style>
        <span class="displayhtml" rv-html="widget:userHtml">text</span>
	</div>
<% } %>

