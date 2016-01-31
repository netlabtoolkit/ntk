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
            <div class="inletValue"><span rv-text="widget:text"></span> Text</div>
            <div class="inletValue"><span rv-text="widget:left | rounded">100</span> X</div>
            <div class="inletValue"><span rv-text="widget:top | rounded">100</span> Y</div>
            <div class="inletValue"><span rv-text="widget:opacity | rounded">100</span> Opacity</div>
        </div>
    </div>
            
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <strong>Text Box</strong><br>
            <div class="inletValue"><input class="appendText" type="checkbox" rv-checked="widget:appendText" /> Append new text</div>
            <label class="narrowLabel">width</label> <input class="displayWidth" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayWidth"><br>
            <label class="narrowLabel">class</label> <input class="displayClass" class="moreParam" type="text" rv-value="widget:displayClass"><br>
            <hr><strong>Font</strong><br>
            <label class="narrowLabel">size</label> <input class="displayFontSize" class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayFontSize"><br>
            <label class="narrowLabel">color</label> <input class="displayFontColor" class="moreParam" type="text" rv-value="widget:displayFontColor"><br>
            <div class="inletValue"><input class="displayFontItalic" type="checkbox" rv-checked="widget:displayFontItalic" /> Italic  
            <input class="displayFontBold" type="checkbox" rv-checked="widget:displayFontBold" /> Bold</div>
            <select class="displayFontFamily" rv-value='widget:displayFont'>
              <option value='Arial, Helvetica, sans-serif'>Arial</option>
              <option value='Tahoma, Geneva, sans-serif'>Tahoma</option>
              <option value='Georgia, serif'>Georgia</option>
              <option value='"Times New Roman", Times, serif'>Times</option>
              <option value='"Courier New", Courier, monospace'>Courier New</option>
            </select> 
            <hr>
            <strong>Displayed Text</strong><br>
            <textarea class="database" rv-value="widget:in" rows="4" cols="70"></textarea>
        </div>
    </div>

</div>
        
<% if(!server) { %>
	<div class="detachedEl" rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top">
        <span class="displaytext" rv-text="widget:displayText">text</span>
	</div>
<% } %>

