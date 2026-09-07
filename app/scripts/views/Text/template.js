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

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <strong>Text Box</strong><br>
            <div class="inletValue"><input class="appendText" type="checkbox" rv-checked="widget:appendText" /> Append new text</div>
            <label class="narrowLabel">width</label> <input class="displayWidth moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayWidth">
            <label class="narrowLabel">height</label> <input class="displayHeight moreParam" type="text" pattern="[0-9]*" rv-value="widget:displayHeight"><br>
            <label class="narrowLabel">class</label> <input class="displayClass moreParam" type="text" rv-value="widget:displayClass"><br>
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
            <div class="inletValue"><input class="renderMarkdown" type="checkbox" rv-checked="widget:renderMarkdown" /> Render Markdown</div>
            <textarea class="database" rv-value="widget:in" rows="4" cols="70"></textarea><br>
            <button class="importText" type="button">import…</button>
            <button class="exportText" type="button">export…</button>
            <span class="fileStatus"></span>
            <div class="textStats">
                <span class="wordCount"></span>
                <span class="topWords"></span>
            </div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/text/" target="_blank">Widget help</a>
        </div>
    </div>

</div>
        
<% if(!server) { %>
	<div class="detachedEl textDisplay" rv-style-opacity="widget:opacity"
        rv-positionx="widget:left"
        rv-positiony="widget:top">
        <div class="detachedDrag" title="drag to move"></div>
        <div class="displayScroll">
            <div class="displaytext">text</div>
        </div>
	</div>
<% } %>

