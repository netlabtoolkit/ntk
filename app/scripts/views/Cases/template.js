<div class="widgetAuthoring">
    <div class="headerPorts headerStart"><div class="inlet headerPort" data-field="inTrigger" alt="trigger" title="trigger: test the input once when this rises past the threshold. With trigger wired, the input is tested only then, not on every change.">&#9656;</div></div>
    <div class="widgetTop typeLogic">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:bodyIns" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="casesRows">
            <div class="caseRow" rv-each-row="widget:rowViews" rv-class-matched="row.matched" rv-class-never="row.never" rv-data-id="row.id" rv-title="row.full"><span class="caseRowGrip" rv-class-fixed="row.fixed">&#8942;&#8942;</span><span rv-text="row.label"></span></div>
        </div>
        <input class="casesIn" type="text" spellcheck="false" rv-value="widget:in" placeholder="type to test…" title="The input: wire a number or text into the inlet, or type here to try the rows">
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:bodyOuts" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <div class="casesEditor"></div>
            <button type="button" class="casesAdd" title="add a row, copying the last test (up to 12)">+ add row</button>
            <hr>
            <label>match</label> <select class="casesFirst" rv-value="widget:match" title="First: only the first matching row sends, like a list of cases - right for ranges. All: every matching row sends - right for text that can mention two things.">
                <option value="first">first match only</option>
                <option value="all">all matches</option>
            </select><br>
            <label>outlets</label> <select class="casesMode" rv-value="widget:mode" title="on/off: 1023 while a row matches, 0 when it doesn't. pulse: 1023 for a fifth of a second when a row starts matching - to start a Scene or SpeechOut. pass through: a matching row sends the input itself.">
                <option value="onoff">on/off</option>
                <option value="pulse">pulse</option>
                <option value="pass">pass through</option>
            </select><br>
            <label>hold (ms)</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:hold" title="A new match must last this long before the outlets change, so a noisy sensor near a boundary doesn't flicker between rows. 0: at once."><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold" title="The level the trigger port has to rise past (512 by default)"><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/cases/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
