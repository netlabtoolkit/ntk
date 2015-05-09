<div class="widgetAuthoring">
    <div class="widgetTop typeProcess">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyTop">
            <div class="widgetBodyLeft">
                <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
            </div>
            <div class="widgetBodyRight">
                <div class="inletValue"><span class="dataIndex" rv-text="widget:dataIndex">0</span></div>
            </div>

            <div class="dataOut"><span rv-text="widget:out"></span></div>
        </div>

        <select id="orderType" rv-value='widget:orderType'>
          <option value="ordered">ordered</option>
          <option value="reverse">reverse</option>
          <option value="randomFull">randFull</option>
          <option value="randomNoRepeat">randNoRep</option>
          <option value="randomAny">randAny</option>
        </select> 
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>
            
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
        <label>range</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:rangeMin">
        <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:rangeMax"><br>
        <label>segments</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:segments"><br>
        <label>delimiter</label> <input class="moreParam" type="text" rv-value="widget:delimiter"> (use &#92;n for newline)<br>
        database text<br>
            <textarea id="database" rv-value="widget:database" rows="4" cols="70">

            </textarea><br>
        ordered data<br>
            <textarea rv-value="widget:orderedDatabase" rows="4" cols="70">

            </textarea>
        </div>
    </div>
</div>